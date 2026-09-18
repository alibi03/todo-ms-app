import type { User } from "../models/domain/User";
import type { PublicUserResponse } from "../models/dto/responses/PublicUserResponse";
import type { UserLookupResponse } from "../models/dto/responses/UserLookupResponse";

export class UserResponseMapper {
  static toLookupResponse(user: User): UserLookupResponse {
    return { user: { id: user.id } };
  }

  static toPublicResponse(user: User): PublicUserResponse {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      created_at: user.createdAt.toISOString(),
    };
  }
}
