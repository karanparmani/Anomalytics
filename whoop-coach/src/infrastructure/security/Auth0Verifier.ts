import { createRemoteJWKSet, jwtVerify } from "jose";
import { AuthenticationRequiredError } from "../../domain/errors.js";

export interface AuthenticatedPrincipal {
  readonly subject: string;
  readonly scopes: readonly string[];
}

export class Auth0Verifier {
  readonly #issuer: string;
  readonly #jwks: ReturnType<typeof createRemoteJWKSet>;

  public constructor(
    issuerBaseUrl: string,
    private readonly audience: string,
    private readonly allowedSubject?: string,
  ) {
    this.#issuer = issuerBaseUrl.endsWith("/") ? issuerBaseUrl : `${issuerBaseUrl}/`;
    this.#jwks = createRemoteJWKSet(new URL(".well-known/jwks.json", this.#issuer));
  }

  public async verifyAuthorizationHeader(header: string | undefined): Promise<AuthenticatedPrincipal> {
    const [scheme, token, extra] = header?.split(" ") ?? [];
    if (scheme !== "Bearer" || token === undefined || extra !== undefined) throw new AuthenticationRequiredError();
    try {
      const { payload } = await jwtVerify(token, this.#jwks, {
        issuer: this.#issuer,
        audience: this.audience,
      });
      if (typeof payload.sub !== "string") throw new AuthenticationRequiredError("Token has no subject.");
      if (this.allowedSubject !== undefined && payload.sub !== this.allowedSubject) {
        throw new AuthenticationRequiredError("This personal app is not enabled for that account.");
      }
      const scope = typeof payload.scope === "string" ? payload.scope.split(" ").filter(Boolean) : [];
      return { subject: payload.sub, scopes: scope };
    } catch (error: unknown) {
      if (error instanceof AuthenticationRequiredError) throw error;
      throw new AuthenticationRequiredError("The access token is invalid or expired.");
    }
  }
}
