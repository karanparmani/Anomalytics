import { Request, Response, NextFunction } from "express";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}

/**
 * requireAuth middleware enforces that a valid user/service identity is present.
 */
export function requireAuth() {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({ error: "Unauthorized: Missing Authorization header" });
      return;
    }

    // Mock validation for demo/simulation (e.g., Bearer admin-token or Bearer user-token)
    const token = authHeader.replace("Bearer ", "").trim();

    if (token === "admin-token") {
      req.user = { id: "usr_admin", role: "admin" };
      next();
    } else if (token === "soc-token" || token === "threat-ops-token") {
      req.user = { id: "usr_soc", role: "soc_analyst" };
      next();
    } else if (token === "client-token") {
      req.user = { id: "usr_client", role: "client_service" };
      next();
    } else {
      res.status(401).json({ error: "Unauthorized: Invalid signature or token expired" });
    }
  };
}

/**
 * requireRole middleware restricts access to specific application groups.
 */
export function requireRole(allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized: Authentication required" });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: `Forbidden: Access restricted. Requires roles: [${allowedRoles.join(", ")}]` });
      return;
    }

    next();
  };
}
