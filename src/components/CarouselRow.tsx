import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

interface CarouselRowProps {
  title: string;
  subtitle?: string;
  rightMeta?: ReactNode;
  children: ReactNode;
}

export function CarouselRow({
  title,
  subtitle,
  rightMeta,
  children,
}: CarouselRowProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 12);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 12);
  }, []);

  useEffect(() => {
    updateScrollState();
    window.addEventListener("resize", updateScrollState);
    return () => window.removeEventListener("resize", updateScrollState);
  }, [updateScrollState, children]);

  const scrollByViewport = (direction: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const distance = Math.max(320, Math.round(el.clientWidth * 0.82));
    el.scrollBy({ left: direction * distance, behavior: "smooth" });
  };

  return (
    <section className="group/row relative space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 sm:px-8 lg:px-12">
        <div className="min-w-0">
          <h2 className="font-display text-lg sm:text-xl font-bold text-white tracking-tight">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-xs text-neutral-400">{subtitle}</p>
          )}
        </div>
        {rightMeta && (
          <div className="text-xs text-neutral-400 shrink-0">{rightMeta}</div>
        )}
      </div>

      <div className="relative">
        {canLeft && (
          <button
            type="button"
            onClick={() => scrollByViewport(-1)}
            aria-label={`Scroll ${title} left`}
            className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 z-30 h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/80 text-white shadow-lg opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 hover:bg-[#E50914] hover:border-[#E50914] transition-all cursor-pointer"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}

        <div
          ref={scrollerRef}
          onScroll={updateScrollState}
          className="flex gap-3.5 sm:gap-4 overflow-x-auto overflow-y-visible scroll-smooth snap-x snap-proximity no-scrollbar px-4 sm:px-8 lg:px-12 py-2"
        >
          {children}
        </div>

        {canRight && (
          <button
            type="button"
            onClick={() => scrollByViewport(1)}
            aria-label={`Scroll ${title} right`}
            className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 z-30 h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/80 text-white shadow-lg opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 hover:bg-[#E50914] hover:border-[#E50914] transition-all cursor-pointer"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>
    </section>
  );
}
