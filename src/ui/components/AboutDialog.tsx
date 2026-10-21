import { useEffect, useRef } from 'react';
import { ABOUT_COPY } from '../copy.ts';
import { PARAMETERS } from '../parameters.ts';
import { APP_NAME, DISCLAIMER } from '../strings.ts';

/** About: disclaimer, methods in brief, limitations, and the fixed parameters (PROJECT_SPEC 5.5). */
export function AboutContent() {
  return (
    <>
      <h2 id="about-title" className="section-title" tabIndex={-1}>
        {`About ${APP_NAME}`}
      </h2>
      <p className="about__disclaimer">{DISCLAIMER}</p>

      <h3 className="about__heading">How it works</h3>
      <ul className="about__list">
        {ABOUT_COPY.methods.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>

      <h3 className="about__heading">Limitations</h3>
      <ul className="about__list">
        {ABOUT_COPY.limitations.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>

      <h3 className="about__heading">Fixed settings</h3>
      <p>{ABOUT_COPY.parametersNote}</p>
      {PARAMETERS.map((g) => (
        <table key={g.title} className="tool__table about__table">
          <caption className="plot__title">{g.title}</caption>
          <tbody>
            {g.rows.map((r) => (
              <tr key={r.name}>
                <th scope="row">{r.name}</th>
                <td>{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
      <p>{ABOUT_COPY.docs}</p>
    </>
  );
}

/** A modal dialog (native <dialog>: focus is trapped and Escape closes it). */
export function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // Start at the top: focus the title rather than the Close button at the end.
      d.querySelector<HTMLElement>('#about-title')?.focus();
      d.scrollTop = 0;
    }
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className="about card" aria-labelledby="about-title" onClose={onClose}>
      {open ? (
        <>
          <AboutContent />
          <div className="setup__actions">
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Close
            </button>
          </div>
        </>
      ) : null}
    </dialog>
  );
}
