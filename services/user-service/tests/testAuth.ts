const unusedAuth = {
  authentication: {
    login: async (): Promise<never> => { throw new Error("Unexpected login call."); },
    getProfile: async (): Promise<never> => { throw new Error("Unexpected profile call."); },
  },
  tokens: {
    verify: (): never => { throw new Error("Unexpected token verification."); },
  },
};

export default unusedAuth;
