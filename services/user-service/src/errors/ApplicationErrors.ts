class ApplicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

class ValidationError extends ApplicationError {}
class AuthenticationError extends ApplicationError {}
class ConflictError extends ApplicationError {}
class ConfigurationError extends ApplicationError {}
class PersistenceError extends ApplicationError {}

export {
  AuthenticationError,
  ConfigurationError,
  ConflictError,
  PersistenceError,
  ValidationError,
};
