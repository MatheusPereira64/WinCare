const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

/* Os módulos usam `electron` só em tempo de execução; aqui testamos a lógica pura. */
const originalLoad = Module._load;
Module._load = function load(request, ...rest) {
  if (request === "electron") return { app: {}, shell: {}, Notification: class {} };
  return originalLoad.call(this, request, ...rest);
};

const {
  buildLeftoverCandidates,
  isProtectedPath,
  isProtectedRegistryKey,
  isUsedByOtherProgram,
  nameVariants,
  parseCommandLine,
  stripVersionSuffix,
} = require("../uninstaller.cjs");
const { buildCleanerTargets, requiresClosedApp } = require("../cleaner.cjs");
const {
  buildTaskXml,
  nextStartBoundary,
  normalizeConfig,
  parseJobArg,
} = require("../scheduler.cjs");
const { sanitizeDescription } = require("../restore-point.cjs");
const { parseJsonOutput, psQuote } = require("../powershell.cjs");

const env = {
  SystemDrive: "C:",
  WINDIR: "C:\\Windows",
  ProgramFiles: "C:\\Program Files",
  "ProgramFiles(x86)": "C:\\Program Files (x86)",
  ProgramData: "C:\\ProgramData",
  USERPROFILE: "C:\\Users\\Ana Lima",
  APPDATA: "C:\\Users\\Ana Lima\\AppData\\Roaming",
  LOCALAPPDATA: "C:\\Users\\Ana Lima\\AppData\\Local",
  PUBLIC: "C:\\Users\\Public",
  TEMP: "C:\\Users\\Ana Lima\\AppData\\Local\\Temp",
};

test("pastas do sistema e raízes nunca podem ser removidas", () => {
  for (const blocked of [
    "C:\\",
    "C:\\Foo",
    "C:\\Windows",
    "C:\\Windows\\System32\\drivers",
    "C:\\Program Files",
    "C:\\Program Files\\",
    "c:\\program files (x86)",
    "C:\\Program Files\\Common Files\\Foo",
    "C:\\Program Files\\WindowsApps\\Foo",
    "C:\\ProgramData",
    "C:\\Users",
    env.USERPROFILE,
    env.APPDATA,
    env.LOCALAPPDATA,
    `${env.LOCALAPPDATA}\\Programs`,
    `${env.USERPROFILE}\\Documents`,
    `${env.USERPROFILE}\\Downloads`,
    "relativo\\pasta",
    "",
  ]) {
    assert.equal(isProtectedPath(blocked, env), true, blocked);
  }
});

test("pastas de programas removidos podem ser candidatas", () => {
  for (const allowed of [
    "C:\\Program Files\\Foo App",
    "C:\\Program Files (x86)\\Fabricante\\Foo",
    `${env.LOCALAPPDATA}\\Foo`,
    `${env.APPDATA}\\Foo`,
    "D:\\Jogos\\Foo",
  ]) {
    assert.equal(isProtectedPath(allowed, env), false, allowed);
  }
});

test("chaves de registro do Windows ficam protegidas", () => {
  for (const blocked of [
    "HKLM\\Software",
    "HKCU\\Software\\Microsoft",
    "HKLM\\Software\\Microsoft\\Windows NT",
    "HKLM\\Software\\Classes\\Foo",
    "HKLM\\Software\\Policies\\Foo",
    "HKLM\\SYSTEM\\CurrentControlSet",
    "HKCU\\Software\\Windows",
    "HKCU\\Software\\..\\Foo",
  ]) {
    assert.equal(isProtectedRegistryKey(blocked), true, blocked);
  }
  assert.equal(isProtectedRegistryKey("HKCU\\Software\\Foo"), false);
  assert.equal(isProtectedRegistryKey("HKLM\\Software\\WOW6432Node\\Fabricante\\Foo"), false);
  assert.equal(
    isProtectedRegistryKey("HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Foo"),
    false,
  );
});

test("nomes de programa perdem versão e arquitetura", () => {
  assert.equal(stripVersionSuffix("7-Zip 23.01 (x64)"), "7-Zip");
  assert.equal(stripVersionSuffix("Foo Bar v1.2.3"), "Foo Bar");
  assert.equal(stripVersionSuffix("Notepad++ (64-bit x64)"), "Notepad++");
  assert.deepEqual(nameVariants("Update"), []);
  assert.deepEqual(nameVariants("Microsoft"), []);
  assert.ok(nameVariants("Foo Bar 2.0").includes("FooBar"));
});

test("resíduos nunca incluem só a pasta do fabricante", () => {
  const program = { id: "x", name: "Foo App 2.0", publisher: "Acme Inc.", installLocation: "" };
  const { folders, keys } = buildLeftoverCandidates(program, env);
  const paths = folders.map((f) => f.path.toLowerCase());
  assert.ok(paths.includes("c:\\program files\\foo app"));
  assert.ok(paths.includes("c:\\program files\\acme\\foo app"));
  assert.ok(!paths.includes("c:\\program files\\acme"));
  assert.ok(!keys.some((k) => /\\acme$/i.test(k.path)));
});

test("pasta de instalação só entra se corresponder ao nome do programa", () => {
  const unrelated = { id: "x", name: "Foo App", publisher: "", installLocation: "D:\\Backups" };
  assert.ok(!buildLeftoverCandidates(unrelated, env).folders.some((f) => /backups/i.test(f.path)));
  const related = {
    id: "y",
    name: "Foo App",
    publisher: "",
    installLocation: "D:\\Jogos\\FooApp\\",
  };
  assert.ok(
    buildLeftoverCandidates(related, env).folders.some((f) => f.path === "D:\\Jogos\\FooApp"),
  );
});

test("pasta usada por outro programa instalado não é resíduo", () => {
  const program = { id: "a", name: "Suite Editor" };
  const others = [
    program,
    { id: "b", name: "Suite Viewer", installLocation: "C:\\Program Files\\Suite\\Viewer" },
    { id: "c", name: "Foo 2.0", installLocation: "" },
  ];
  assert.equal(isUsedByOtherProgram("C:\\Program Files\\Suite", program, others), true);
  assert.equal(isUsedByOtherProgram("C:\\Program Files\\Foo", program, others), true);
  assert.equal(isUsedByOtherProgram("C:\\Program Files\\Editor", program, others), false);
});

test("UninstallString é separado em executável e argumentos", () => {
  assert.deepEqual(parseCommandLine('"C:\\Program Files (x86)\\Foo\\unins000.exe" /SILENT'), {
    file: "C:\\Program Files (x86)\\Foo\\unins000.exe",
    args: "/SILENT",
  });
  assert.deepEqual(parseCommandLine("MsiExec.exe /X{ABC-123}"), {
    file: "MsiExec.exe",
    args: "/X{ABC-123}",
  });
  assert.deepEqual(parseCommandLine("C:\\Program Files\\Foo\\uninstall.exe --force"), {
    file: "C:\\Program Files\\Foo\\uninstall.exe",
    args: "--force",
  });
  assert.equal(parseCommandLine("   "), null);
});

test("limpeza não toca em senhas, favoritos nem no histórico do Firefox", () => {
  const dirent = (name) => ({ name, isDirectory: () => true });
  const readdir = (dir) => {
    if (dir.endsWith("User Data")) {
      return [dirent("Default"), dirent("Profile 1"), dirent("System Profile")];
    }
    if (dir.endsWith("Firefox\\Profiles")) return [dirent("abc.default-release")];
    return [];
  };
  const targets = buildCleanerTargets(env, readdir, () => ({ Default: "Pessoal" }));
  const allPaths = targets
    .flatMap((t) => t.paths)
    .join("\n")
    .toLowerCase();
  for (const forbidden of [
    "login data",
    "bookmarks",
    "web data",
    "places.sqlite",
    "key4.db",
    "logins.json",
  ]) {
    assert.ok(!allPaths.includes(forbidden), forbidden);
  }
  assert.ok(!allPaths.includes("system profile"));
  assert.ok(
    targets.some(
      (t) => t.appId === "chrome" && t.profile === "Pessoal" && t.category === "history",
    ),
  );
  assert.ok(!targets.some((t) => t.appId === "firefox" && t.category === "history"));
  assert.equal(requiresClosedApp("cookies"), true);
  assert.equal(requiresClosedApp("cache"), false);
});

test("argumento de rotina só aceita rotinas conhecidas", () => {
  assert.equal(parseJobArg(["app", "--wincare-job=cleanup"]), "cleanup");
  assert.equal(parseJobArg(["app", "--wincare-job=full-check"]), "full-check");
  assert.equal(parseJobArg(["app", "--wincare-job=constructor"]), null);
  assert.equal(parseJobArg(["app"]), null);
});

test("configuração de agendamento é normalizada", () => {
  assert.deepEqual(
    normalizeConfig({ frequency: "monthly", monthDay: 31, weekDay: 9, time: "25:00" }),
    { frequency: "monthly", weekDay: 0, monthDay: 1, time: "12:00" },
  );
  assert.deepEqual(
    normalizeConfig({ frequency: "weekly", weekDay: 3, monthDay: 15, time: "22:30" }),
    { frequency: "weekly", weekDay: 3, monthDay: 15, time: "22:30" },
  );
});

test("XML da tarefa escapa caminhos e define o nível correto", () => {
  const launch = { exe: "D:\\A&B\\WinCare.exe", args: [], cwd: "D:\\A&B" };
  const config = normalizeConfig({ frequency: "weekly", weekDay: 2, time: "09:00" });
  const now = new Date(2026, 10, 1, 10, 0, 0);
  const xml = buildTaskXml("cleanup", config, launch, "PC\\Ana", now);
  assert.ok(xml.includes("<Command>D:\\A&amp;B\\WinCare.exe</Command>"));
  assert.ok(xml.includes("<Arguments>--wincare-job=cleanup</Arguments>"));
  assert.ok(xml.includes("<RunLevel>LeastPrivilege</RunLevel>"));
  assert.ok(xml.includes("<Tuesday />"));
  assert.ok(xml.includes("<StartBoundary>2026-11-02T09:00:00</StartBoundary>"));
  const full = buildTaskXml(
    "full-check",
    config,
    { ...launch, args: ["C:\\Meu Projeto"] },
    "PC\\Ana",
    now,
  );
  assert.ok(full.includes("<RunLevel>HighestAvailable</RunLevel>"));
  assert.ok(full.includes("&quot;C:\\Meu Projeto&quot; --wincare-job=full-check"));
});

test("primeira execução agendada é sempre no futuro", () => {
  const now = new Date(2026, 10, 1, 10, 0, 0);
  assert.equal(nextStartBoundary({ time: "22:00" }, now), "2026-11-01T22:00:00");
  assert.equal(nextStartBoundary({ time: "06:00" }, now), "2026-11-02T06:00:00");
});

test("listas do PowerShell 5.1 são desembrulhadas", () => {
  assert.deepEqual(parseJsonOutput('{"value":[{"a":1},{"a":2}],"Count":2}'), [{ a: 1 }, { a: 2 }]);
  assert.deepEqual(parseJsonOutput('﻿[{"a":1}]'), [{ a: 1 }]);
  assert.deepEqual(parseJsonOutput('{"ok":true,"value":[1]}'), { ok: true, value: [1] });
  assert.equal(parseJsonOutput(""), null);
});

test("textos enviados ao PowerShell são escapados", () => {
  assert.equal(psQuote("D:\\O'Brien"), "'D:\\O''Brien'");
  assert.equal(psQuote("a\u2019b"), "'a''b'");
  assert.equal(sanitizeDescription("Reset; Remove-Item 'C:\\*' $(x)"), "Reset Remove-Item C (x)");
});
