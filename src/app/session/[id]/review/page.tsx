import { SessionReview } from "./session-review";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ReviewPage({ params }: Props) {
  const { id } = await params;
  return <SessionReview sessionId={id} />;
}
