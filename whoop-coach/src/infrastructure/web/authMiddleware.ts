import type { RequestHandler } from "express";
import type { Auth0Verifier, AuthenticatedPrincipal } from "../security/Auth0Verifier.js";

export interface AuthLocals extends Record<string, unknown> {
  principal: AuthenticatedPrincipal;
}

export const requireAuth = (verifier: Auth0Verifier, resourceMetadataUrl: string): RequestHandler<never, unknown, unknown, unknown, AuthLocals> =>
  async (request, response, next) => {
    try {
      response.locals.principal = await verifier.verifyAuthorizationHeader(request.header("authorization"));
      next();
    } catch {
      response
        .status(401)
        .setHeader("WWW-Authenticate", `Bearer resource_metadata="${resourceMetadataUrl}", scope="whoop:read"`)
        .json({ error: "authentication_required" });
    }
  };

export const requireRole = (requiredScope: string): RequestHandler<never, unknown, unknown, unknown, AuthLocals> =>
  (_request, response, next) => {
    if (!response.locals.principal.scopes.includes(requiredScope)) {
      response.status(403).json({ error: "insufficient_scope" });
      return;
    }
    next();
  };
