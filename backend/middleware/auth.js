const jwt = require("jsonwebtoken");

function authenticate(req, res, next) {
    const header = req.get("authorization") || "";
    const [scheme, token] = header.split(" ");

    if (scheme !== "Bearer" || !token) {
        return res.status(401).json({ message: "Sign in to continue" });
    }

    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (error) {
        if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError") {
            return res.status(401).json({ message: "Your session has expired. Please sign in again." });
        }
        next(error);
    }
}

function allowRoles(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ message: "You do not have permission to do that" });
        }
        next();
    };
}

module.exports = { authenticate, allowRoles };
