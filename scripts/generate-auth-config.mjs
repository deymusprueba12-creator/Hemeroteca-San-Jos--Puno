import { readFileSync, writeFileSync } from "node:fs";

const envFile = new URL("../.env", import.meta.url);

function loadLocalEnv() {
  try {
    const contents = readFileSync(envFile, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match || match[1] in process.env) continue;

      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      } else {
        value = value.replace(/\s+#.*$/, "").trim();
      }
      process.env[match[1]] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

loadLocalEnv();

const requiredNames = [
  "DOCENTE_USERNAME",
  "DOCENTE_PASSWORD",
  "ESTUDIANTE_USERNAME",
  "ESTUDIANTE_PASSWORD"
];
const missing = requiredNames.filter((name) => !process.env[name]);

let config = null;
if (missing.length === 0) {
  config = {
    docente: {
      username: process.env.DOCENTE_USERNAME,
      password: process.env.DOCENTE_PASSWORD
    },
    estudiante: {
      username: process.env.ESTUDIANTE_USERNAME,
      password: process.env.ESTUDIANTE_PASSWORD
    }
  };
}

const output = [
  "/* Archivo generado automáticamente. No versionar: contiene credenciales visibles en el navegador. */",
  `window.BIBLIOTECA_AUTH_CONFIG = ${JSON.stringify(config)};`,
  ""
].join("\\n");

writeFileSync(new URL("../auth-config.js", import.meta.url), output, {
  encoding: "utf8",
  mode: 0o600
});

if (missing.length) {
  console.warn(`auth-config.js generado sin accesos: faltan ${missing.join(", ")}. El login permanecerá deshabilitado hasta configurar las variables.`);
} else {
  console.log("auth-config.js generado. Recuerda: esta configuración estática NO es seguridad real.");
}
