interface AppLogger {
  error(message: string, error: unknown): void;
}

export default AppLogger;
