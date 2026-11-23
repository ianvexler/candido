/** The logo's hard hat, drawn so it stays crisp at any size. */
const HardHat = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 64 44" className={className} aria-hidden>
    <g fill="#fff" stroke="#8f9aa3" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round">
      <path d="M7 36C6 18 17 7 26 6q6-5 12 0c9 1 20 12 19 30Z" />
      <path d="M2 36q30-7 60 0v5q-30-6-60 0Z" />
      <path d="M23 10q-5 8-5 18M41 10q5 8 5 18" fill="none" stroke="#c8ced2" />
    </g>
  </svg>
);

export default HardHat;
