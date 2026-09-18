import { packageName } from "./index.js";

const app = document.getElementById("app");
if (app) app.textContent = `${packageName()} placeholder. Pages arrive in m0-06.`;
