class CreateUserModel {
  constructor(
    readonly username: string,
    readonly email: string,
    readonly passwordHash: string
  ) {}
}

export { CreateUserModel };
