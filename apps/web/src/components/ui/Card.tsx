// ─────────────────────────────────────────────────────────────────
// Card.tsx — the white-on-canvas frame that wraps every screen section.
//
// <Card> alone gives you the bordered, shadowed surface.
// <CardHead> is the top row with title + actions.
// <CardBody> is the inner padding (use `flush` for tables/lists with
// no extra padding — the children handle their own).
//
// Composition example:
//   <Card>
//     <CardHead>
//       <CardTitle icon={<WrenchIcon/>}>Parts &amp; labor</CardTitle>
//       <Button size="sm">+ Add</Button>
//     </CardHead>
//     <CardBody flush>
//       <DenseTable>...</DenseTable>
//     </CardBody>
//   </Card>
// ─────────────────────────────────────────────────────────────────
import type { HTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('card', className)} {...p} />;
}

export function CardHead({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('card-head', className)} {...p} />;
}

export function CardTitle({
  icon, children, className, ...p
}: HTMLAttributes<HTMLDivElement> & { icon?: ReactNode }) {
  return (
    <div className={clsx('card-title', className)} {...p}>
      {icon}
      <span>{children}</span>
    </div>
  );
}

export function CardSub({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('card-sub', className)} {...p} />;
}

export function CardBody({
  flush, className, ...p
}: HTMLAttributes<HTMLDivElement> & { flush?: boolean }) {
  return <div className={clsx('card-body', flush && 'flush', className)} {...p} />;
}
