/**
 * Putting a submitted form back the way the person left it.
 *
 * React resets an uncontrolled form once its action settles, so every control
 * falls back to its default — blank on the checkout, the stored value on the
 * workspace editors. That is right after a success and wrong after a validation
 * error, where the answer is to hand the submitted values straight back.
 *
 * The rules live here, away from the DOM, so they can be checked on their own:
 * `npm run form-restore-check`.
 */

/** The string fields of a submitted form, in the order the browser sent them. */
export type SubmittedValues = [string, string][];

/** A form control as the restore needs to see it. */
export interface ControlSnapshot {
  name: string;
  /**
   * `value` covers everything carrying a typed or chosen value; `toggle` is a
   * checkbox or radio, which is restored by whether it was submitted at all;
   * `ignored` is a file input (unwritable), a hidden field (rendered from props
   * React never lost) or a button.
   */
  kind: "value" | "toggle" | "ignored";
  /** What a toggle submits when it is on. Unused by the other kinds. */
  submits: string;
}

export type Restoration = { value: string } | { checked: boolean } | null;

/** Every string field of a submission, kept in document order. */
export function captureValues(formData: FormData): SubmittedValues {
  const entries: SubmittedValues = [];
  formData.forEach((value, key) => {
    if (typeof value === "string") entries.push([key, value]);
  });
  return entries;
}

/**
 * Works out what each control should show again, one answer per control in the
 * order handed in. Nothing here depends on which attempt failed, so the tenth
 * rejected submission is restored exactly like the first.
 */
export function planRestore(controls: ControlSnapshot[], submitted: SubmittedValues): Restoration[] {
  // Controls can share a name — a repeated row, a list of addresses — so each
  // captured entry is handed out once, in the order the browser submitted them.
  const taken = new Set<number>();

  return controls.map((control) => {
    if (control.kind === "ignored" || !control.name) return null;
    if (control.kind === "toggle") {
      return {
        checked: submitted.some(([key, value]) => key === control.name && value === control.submits),
      };
    }
    const index = submitted.findIndex(([key], i) => key === control.name && !taken.has(i));
    if (index < 0) return null;
    taken.add(index);
    return { value: submitted[index][1] };
  });
}
