class CreateUserModel {
  readonly username: string;
  readonly email: string;
  readonly passwordHash: string;

  constructor(
    username: string,
    email: string,
    passwordHash: string
  ) {
    this.username = username;
    this.email = email;
    this.passwordHash = passwordHash;
  }
}

export { CreateUserModel };
