import { DISCLAIMER } from '../strings.ts';

export function Footer() {
  return (
    <footer className="app-footer">
      <p className="app-footer__disclaimer">{DISCLAIMER}</p>
    </footer>
  );
}
