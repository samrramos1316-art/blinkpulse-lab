/**
 * "Skip to main content". It moves focus itself instead of following `#main`: the hash
 * selects the view (Root.tsx), so following it would leave study mode or a tool and
 * end what was running there.
 */
export function SkipLink() {
  return (
    <a
      className="skip-link"
      href="#main"
      onClick={(e) => {
        e.preventDefault();
        const main = document.getElementById('main');
        main?.focus();
        main?.scrollIntoView();
      }}
    >
      Skip to main content
    </a>
  );
}
