import { RestTimer } from "./rest-timer";

type Props = { params: Promise<{ id: string }> };

export default async function RestPage({ params }: Props) {
  const { id } = await params;
  return <RestTimer sessionId={id} />;
}
