class Task {
  readonly id: number;
  readonly title: string;
  readonly description: string;
  readonly status: "pending";
  readonly ownerUserId: number;
  readonly createdAt: Date;

  constructor(id: number, title: string, description: string, status: "pending", ownerUserId: number, createdAt: Date) {
    this.id = id;
    this.title = title;
    this.description = description;
    this.status = status;
    this.ownerUserId = ownerUserId;
    this.createdAt = createdAt;
  }
}

export default Task;
