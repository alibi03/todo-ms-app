import type User from "../models/domain/User";
import type { PublicUserResponse } from "../models/responses/UserResponses";

class UserResponseMapper {
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

export default UserResponseMapper;
