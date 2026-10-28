"use client";

import { startTransition, type FormEvent } from "react";

// Sends a form to a server action without clearing it. React empties a <form action> after every submit,
// which wipes what people typed when the server answers with an error. Use as <form onSubmit={keepValues(action)}>.
export function keepValues(dispatch: (data: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => dispatch(data));
  };
}
