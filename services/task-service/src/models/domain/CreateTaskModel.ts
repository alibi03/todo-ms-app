class CreateTaskModel {
  readonly title: string;
  readonly description: string;
  readonly ownerUserId: number;

  constructor(title: string, description: string, ownerUserId: number) {
    this.title = title;
    this.description = description;
    this.ownerUserId = ownerUserId;
  }
}

export default CreateTaskModel;
