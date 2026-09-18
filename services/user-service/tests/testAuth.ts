const unusedAuth = {
  userLookup: {
    getUser: async (): Promise<never> => { throw new Error("Unexpected user lookup."); },
  },
  authentication: {
    login: async (): Promise<never> => { throw new Error("Unexpected login call."); },
    getProfile: async (): Promise<never> => { throw new Error("Unexpected profile call."); },
  },
  tokens: {
    create: (): never => { throw new Error("Unexpected token creation."); },
    verify: (): never => { throw new Error("Unexpected token verification."); },
  },
};

export default unusedAuth;
