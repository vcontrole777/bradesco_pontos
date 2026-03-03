import logoClassic from "@/assets/seg-classic.svg";
import logoExclusive from "@/assets/seg-exclusive.svg";
import logoPrime from "@/assets/seg-prime.svg";
import logoPrivate from "@/assets/seg-private.svg";
import logoAfluente from "@/assets/seg-afluente.svg";

export const SEGMENT_LOGOS: Record<string, string> = {
  EXCLUSIVE: logoExclusive,
  PRIVATE: logoPrivate,
  PRIME: logoPrime,
  AFLUENTE: logoAfluente,
  VAREJO: logoClassic,
  JOVEM: logoClassic,
  UNIVERSITARIO: logoClassic,
};

export function getSegmentLogo(segment?: string): string {
  return (segment && SEGMENT_LOGOS[segment]) || logoClassic;
}
