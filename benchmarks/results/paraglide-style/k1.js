export function k1(locale, name) {
  const t = locale === "de" ? "Nachricht 1 für {name}" : locale === "fr" ? "Message 1 pour {name}" : "Message 1 for {name}";
  return t.replace("{name}", name);
}
