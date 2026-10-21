import { useEffect } from 'react';
import { RATING_COPY } from './studyCopy.ts';

const SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

interface RatingPromptProps {
  onAnswer: (rating: number) => void;
  /** 'corner': non-blocking box during the work block; 'inline': the first rating. */
  variant: 'corner' | 'inline';
}

/**
 * One-tap 1-9 rating. The corner box never takes keyboard focus away from the
 * participant's work; the window title changes so it can be seen in the taskbar.
 */
export function RatingPrompt({ onAnswer, variant }: RatingPromptProps) {
  useEffect(() => {
    if (variant !== 'corner') return;
    const title = document.title;
    document.title = `Rating requested - ${title}`;
    return () => {
      document.title = title;
    };
  }, [variant]);

  return (
    <section
      className={variant === 'corner' ? 'rating rating--corner' : 'card rating'}
      aria-labelledby="rating-title"
      aria-live="polite"
    >
      <h2 id="rating-title" className="rating__question">
        {RATING_COPY.question}
      </h2>
      <div className="rating__scale" role="group" aria-labelledby="rating-title">
        {SCALE.map((n) => (
          <button
            key={n}
            type="button"
            className="btn btn-ghost rating__button tabular"
            onClick={() => {
              onAnswer(n);
            }}
          >
            {n}
          </button>
        ))}
      </div>
      <p className="rating__ends">
        <span>{RATING_COPY.low}</span>
        <span>{RATING_COPY.high}</span>
      </p>
      <p className="rating__note">{RATING_COPY.placeholderNote}</p>
    </section>
  );
}
