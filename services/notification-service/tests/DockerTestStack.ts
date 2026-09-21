import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export class DockerTestStack {
  constructor(private readonly project: string) {
    assert.match(project, /^staj-notification-test-[a-z0-9-]+$/, "Only an explicitly disposable Docker project is allowed.");
    assert.equal(process.env.E2E_DISPOSABLE, "true");
  }

  private async container(service: string): Promise<string> {
    assert.ok(["user-service", "task-service", "notification-service", "notification-db", "rabbitmq"].includes(service));
    const name = this.project + "-" + service + "-1";
    const result = await exec("docker", ["inspect", "--format", '{{index .Config.Labels "com.docker.compose.project"}}', name]);
    assert.equal(result.stdout.trim(), this.project);
    return name;
  }

  async control(action: "stop" | "start" | "restart", service: string): Promise<void> {
    await exec("docker", [action, await this.container(service)], { timeout: 30000 });
  }

  async url(service: string): Promise<string> {
    const { stdout } = await exec("docker", ["port", await this.container(service), "3000/tcp"]);
    const address = stdout.trim();
    assert.match(address, /^127\.0\.0\.1:\d+$/);
    return "http://" + address;
  }

  async run(service: string, script: string, data: unknown = {}): Promise<string> {
    const { stdout } = await exec("docker", ["exec", await this.container(service), "node", "-e", script, JSON.stringify(data)],
      { timeout: 15000, maxBuffer: 1024 * 1024 });
    return stdout.trim();
  }

  async query(service: "user-service" | "task-service" | "notification-service", sql: string, values: unknown[] = []): Promise<Record<string, unknown>[]> {
    const result = await this.run(service, `
      const {Pool}=require('pg'); const e=process.env; const {sql,values}=JSON.parse(process.argv[1]);
      const pool=new Pool({host:e.DB_HOST,port:Number(e.DB_PORT),database:e.DB_NAME,user:e.DB_USER,password:e.DB_PASSWORD,connectionTimeoutMillis:3000,statement_timeout:5000});
      pool.query(sql,values).then(result=>console.log(JSON.stringify(result.rows))).catch(()=>{process.exitCode=1;}).finally(()=>pool.end());`, { sql, values });
    return JSON.parse(result);
  }

  async health(service: "user-service" | "task-service" | "notification-service"): Promise<number> {
    return Number(await this.run(service, "fetch('http://127.0.0.1:3000/api/health').then(r=>console.log(r.status)).catch(()=>process.exit(1))"));
  }

  async publish(event: unknown): Promise<void> {
    await this.run("task-service", `
      const {RabbitSession}=require('./dist/src/messaging/RabbitSession');
      const {loadBrokerConfig}=require('./dist/src/config/broker');
      const {ConfirmedDelivery}=require('./dist/src/messaging/ConfirmedDelivery');
      const {MessagingTopology}=require('./dist/src/messaging/MessagingTopology');
      const event=JSON.parse(process.argv[1]);const session=new RabbitSession(loadBrokerConfig());
      (async()=>{const channel=await session.open();await ConfirmedDelivery.send(channel,MessagingTopology.exchange,event.type,Buffer.from(JSON.stringify(event)),{messageId:event.eventId,type:event.type,contentType:'application/json'});})()
      .catch(()=>{process.exitCode=1;}).finally(()=>session.close());`, event);
  }

  async queueCount(queue: string): Promise<number> {
    return Number(await this.run("task-service", `
      const {RabbitSession}=require('./dist/src/messaging/RabbitSession');const {loadBrokerConfig}=require('./dist/src/config/broker');
      const session=new RabbitSession(loadBrokerConfig());(async()=>{const channel=await session.open();const result=await channel.checkQueue(JSON.parse(process.argv[1]));console.log(result.messageCount);})()
      .catch(()=>{process.exitCode=1;}).finally(()=>session.close());`, queue));
  }
}
