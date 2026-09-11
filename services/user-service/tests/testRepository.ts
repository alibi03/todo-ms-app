import type { IUserRepository } from "../src/interfaces/repositories/IUserRepository";

const unusedRepository: IUserRepository = {
  create: async () => { throw new Error("Unexpected user insertion."); },
  findByEmail: async () => { throw new Error("Unexpected email lookup."); },
  findById: async () => { throw new Error("Unexpected user lookup."); },
};

export default unusedRepository;
