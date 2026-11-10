import { render } from "../dist/dom.js";
import { createElement } from "../dist/index.js";
// test@aether.dev / secret123 -> Dummy credentails for login in

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

  const data = await response.json()

  document.getElementById("result")?.remove();
  const result = document.createElement("p");
  result.id = "result";
  result.textContent = data.message;
  document.querySelector(".app")?.appendChild(result);
};

const app = createElement(
  "form",
  { class: "app", onSubmit: handleFormSubmit },
  createElement("h1", {}, "Login Form"),
  createElement(
    "label",
    {
      for: "email",
    },
    "Email:",
  ),

  createElement("input", {
    id: "email",
    type: "email",
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
