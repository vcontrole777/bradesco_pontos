import { Turnstile } from "@marsidev/react-turnstile";

interface TurnstileWidgetProps {
  /** Site Key pública do Cloudflare Turnstile. Widget não renderiza se vazio. */
  siteKey: string;
  onSuccess: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
}

const TurnstileWidget = ({ siteKey, onSuccess, onExpire, onError }: TurnstileWidgetProps) => {
  if (!siteKey) return null;

  return (
    <div className="flex justify-center my-2">
      <Turnstile
        siteKey={siteKey}
        onSuccess={onSuccess}
        onExpire={onExpire}
        onError={onError}
        options={{ theme: "light", size: "normal" }}
      />
    </div>
  );
};

export default TurnstileWidget;
