import { Card, CardContent } from "@/components/ui/card";

interface UserInfoCardProps {
  displayName: string;
  maskedAgency: string;
  maskedAccount: string;
  points?: number;
  segColor: string;
}

const UserInfoCard = ({
  displayName,
  maskedAgency,
  maskedAccount,
}: UserInfoCardProps) => {
  return (
    <Card className="relative z-10 mb-4 overflow-hidden border-0 bg-white shadow-xl rounded-2xl animate-fade-in">
      <CardContent className="px-5 py-4">
        <p className="text-sm font-bold text-foreground uppercase tracking-wide leading-none">
          {displayName}
        </p>
        <div className="mt-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">237 - Banco Bradesco S.A.</p>
          <p className="text-xs text-muted-foreground">Conta Corrente</p>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Ag. {maskedAgency} &nbsp;·&nbsp; Cc. {maskedAccount}
        </p>
      </CardContent>
    </Card>
  );
};

export default UserInfoCard;
