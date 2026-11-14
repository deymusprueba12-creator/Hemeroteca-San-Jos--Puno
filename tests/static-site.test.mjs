import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, script, styles, generator, readme] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../script.js", import.meta.url), "utf8"),
  readFile(new URL("../styles.css", import.meta.url), "utf8"),
  readFile(new URL("../scripts/generate-auth-config.mjs", import.meta.url), "utf8"),
  readFile(new URL("../README.md", import.meta.url), "utf8")
]);

const areas = [
  ["Área de Desarrollo Personal, Ciudadanía y Cívica", "#1E88E5"],
  ["Área de Ciencias Sociales", "#43A047"],
  ["Área de Educación Física", "#F4511E"],
  ["Área de Arte y Cultura", "#8E24AA"],
  ["Área de Comunicación", "#E53935"],
  ["Área de Castellano como Segunda Lengua", "#00ACC1"],
  ["Área de Inglés como Lengua Extranjera", "#3949AB"],
  ["Área de Matemática", "#FB8C00"],
  ["Área de Ciencia y Tecnología", "#00897B"],
  ["Área de Educación para el Trabajo", "#6D4C41"],
  ["Área de Educación Religiosa", "#D81B60"]
];

test("el nombre institucional se actualiza sin conservar el nombre anterior", () => {
  const current = "BIBLIOTECA VIRTUAL DE LA I.E.S. SAN JOSÉ DE PUNO";
  const previous = "Hemeroteca de la I.E. SAN JOSÉ DE PUNO";
  assert.ok(html.includes(current));
  assert.ok(readme.includes(current));
  assert.ok(!html.includes(previous));
  assert.ok(!script.includes(previous));
  assert.ok(!readme.includes(previous));
});

test("el formulario permite elegir accesos separados para ambos roles", () => {
  assert.match(html, /id="loginRol"/);
  assert.match(html, /value="docente">DOCENTES/);
  assert.match(html, /value="estudiante">ESTUDIANTES/);
  assert.ok(html.indexOf('src="auth-config.js"') < html.indexOf('src="script.js"'));
  assert.match(script, /credencialesCorrectas\(u, p, rol\)/);
  assert.match(script, /CONFIG_ACCESOS\[rol\]/);
});

test("están presentes exactamente las once áreas y los colores solicitados", () => {
  assert.equal((script.match(/nombre: 'Área de /g) || []).length, 11);
  for (const [name, color] of areas) {
    assert.ok(script.includes(`nombre: '${name}'`), `Falta el área: ${name}`);
    assert.ok(script.includes(`color: '${color}'`), `Falta el color ${color}`);
  }
});

test("cada área renderiza y filtra su propio formulario y lista de anuncios", () => {
  assert.match(script, /data-area-form=/);
  assert.match(script, /data-area-list=/);
  assert.match(script, /aviso\.areaId === area\.id/);
  assert.match(script, /areaId: areaId/);
  assert.ok(html.includes('id="areasCurriculares"'));
  assert.ok(!html.includes('id="listaAvisos"'));
  assert.ok(!html.includes('id="inicioAnuncios"'));
  assert.ok(!script.includes("#listaAvisos"));
  assert.ok(!script.includes("#inicioAnuncios"));
});

test("no quedan hashes de las antiguas credenciales ni secretos en el generador", () => {
  assert.ok(!script.includes("HASH_PASSWORD_OBJETIVO"));
  assert.ok(!script.includes("a5f6391a182488530de2944e0047842d05f1ad151594f253082bc58819255ed6"));
  assert.match(generator, /DOCENTE_USERNAME/);
  assert.match(generator, /DOCENTE_PASSWORD/);
  assert.match(generator, /ESTUDIANTE_USERNAME/);
  assert.match(generator, /ESTUDIANTE_PASSWORD/);
  assert.match(styles, /\.area-card/);
  assert.match(readme, /no es seguridad real|no constituyen[\\s\\S]*?seguras/i);
});
