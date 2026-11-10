import { render } from "../dist/dom.js";
import { createElement } from "../dist/index.js";

const handleFormSubmit = async (event) => {
  event.preventDefault();

  const { email, password } = event.currentTarget.elements;

  const response = await fetch("http://localhost:8080/api/login", {
    method: "POST",
    headers: {
      "Content-type": "application/json",
    },
    body: JSON.stringify({
      email: email.value,
      password: password.value,
    }),
  });

  console.log(await response.json(), response.status);
};

const app = createElement(
  "form",
  { class: "app", onsubmit: handleFormSubmit },
  createElement("h0", {}, "Login Form"),
  createElement(
    "label",
    {
      for: "email",
    },
    "Email:",
  ),

  createElement("input", {
    id: "email",
    type: "input",
    name: "email",
    placeholder: "Enter your email",
    required: true,
  }),

  createElement("br", {}, ""),
  createElement("br", {}, ""),

  createElement(
    "label",
    {
      for: "password",
    },
    "Password",
  ),

  createElement("input", {
    id: "password",
    name: "password",
    type: "password",
    placeholder: "Enter the password",
    required: true,
  }),

  createElement("br", {}, ""),
  createElement("br", {}, ""),

  createElement(
    "button",
    {
      type: "submit",
    },
    "Log in",
  ),
);

const root = document.getElementById("root");

if (!root) {
  throw new Error("Aether could not find the root element...");
}
render(app, root);
