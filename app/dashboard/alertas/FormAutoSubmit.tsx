"use client";

export default function FormAutoSubmit({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <form
      method="get"
      className={className}
      onChange={(e) => e.currentTarget.requestSubmit()}
    >
      {children}
    </form>
  );
}
