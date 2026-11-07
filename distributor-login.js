// Compatibility entry point for older login pages.
const loginScript = document.createElement("script");
loginScript.src = "login.js";
document.body.append(loginScript);
