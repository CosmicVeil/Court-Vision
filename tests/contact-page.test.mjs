import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const componentPath = new URL("../src/components/Contact.jsx", import.meta.url);
const appPath = new URL("../src/App.jsx", import.meta.url);
const stylesPath = new URL("../src/components/Contact.css", import.meta.url);

test("Contacts page presents the Court-Vision team and public contact details", () => {
  const contactPage = readFileSync(componentPath, "utf8");

  assert.match(contactPage, /Mohan Dixit/);
  assert.match(contactPage, /Backend\/ML Developer/);
  assert.match(contactPage, /linkedin\.com\/in\/mohan-dixit-6396922b5/);
  assert.match(contactPage, /Varun Uday/);
  assert.match(contactPage, /Frontend\/Backend Developer/);
  assert.match(contactPage, /courtvision\.works/);
});

test("Contacts page is reachable from the application router", () => {
  const app = readFileSync(appPath, "utf8");

  assert.match(app, /import Contact from "\.\/components\/Contact\.jsx"/);
  assert.match(app, /<Route path="\/contact" element={<Contact\s*\/>}\s*\/>/);
});

test("Contacts page constrains its layout to the mobile viewport", () => {
  const styles = readFileSync(stylesPath, "utf8");

  assert.match(styles, /width: min\(calc\(100% - 2rem\), 1160px\);/);
});
