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

function required(name) {
  const value = process.env[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Falta la variable requerida: ${name}`);
  }
  return value;
}

const config = {
  docente: {
    username: required("DOCENTE_USERNAME"),
    password: required("DOCENTE_PASSWORD")
  },
  estudiante: {
    username: required("ESTUDIANTE_USERNAME"),
    password: required("ESTUDIANTE_PASSWORD")
  }
};

const output = [
  "/* Archivo generado automáticamente. No versionar: contiene credenciales visibles en el navegador. */",
  `window.BIBLIOTECA_AUTH_CONFIG = Object.freeze(${JSON.stringify(config)});`,
  ""
].join("\n");

writeFileSync(new URL("../auth-config.js", import.meta.url), output, {
  encoding: "utf8",
  mode: 0o600
});

console.log("auth-config.js generado. Recuerda: esta configuración estática NO es seguridad real.");
