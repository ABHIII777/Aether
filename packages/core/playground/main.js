import { createElement } from "../dist/index.js";
import { render } from "../dist/dom.js";

const app = createElement(
  "main",
  { class: "app" },
  createElement("h1", {}, "Aether Login"),
  createElement("label", { for: "email" }, "Email"),
  createElement("input", {
    id: "email",
    name: "email",
    type: "email",
    placeholder: "you@example.com",
    onInput: (event) => {
      const input = event.target;
      console.log("Email:", input.value);
    },
  }),
  createElement("Password", { for: "password" }, "Password"),
  createElement("input", {
    id: "password",
    name: "password",
    tyoe: "password",
    required: true,
    placeholder: "Enter your password",
  }),
  createElement("button", { type: "submit" }, "Log in"),
);

const root = document.getElementById("root");

if (!root) {
  throw new Error("Aether could not find the root element");
}

render(app, root);
