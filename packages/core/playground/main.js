import { createElement as h, render, useState } from "../dist/index.js";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();

    const response = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (response.ok) {
      setMessage(data.message);
      return;
    }

    setMessage(data.error?.message ?? "Unable to log in");
  }

  return h(
    "form",
    { class: "app", onSubmit: handleSubmit },
    h("h1", {}, "Login Form"),
    h("label", { for: "email" }, "Email:"),
    h("input", {
      id: "email",
      type: "email",
      name: "email",
      placeholder: "Enter your email",
      value: email,
      required: true,
      onInput: (event) => setEmail(event.target.value),
    }),
    h("br"),
    h("br"),
    h("label", { for: "password" }, "Password"),
    h("input", {
      id: "password",
      name: "password",
      type: "password",
      placeholder: "Enter the password",
      value: password,
      required: true,
      onInput: (event) => setPassword(event.target.value),
    }),
    h("br"),
    h("br"),
    h("button", { type: "submit" }, "Log in"),
    message ? h("p", { id: "result" }, message) : null,
  );
}

const root = document.getElementById("root");

if (!root) {
  throw new Error("Aether could not find the root element");
}

render(h(LoginForm), root);
