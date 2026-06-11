type PasswordStrengthMeterProps = {
  password: string;
  className?: string;
};

function getPasswordStrength(password: string) {
  if (!password) return 0;
  if (password.length < 6) return 1;
  if (password.length < 10) return 2;
  if (/[A-Z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)) return 3;
  return 2;
}

export function PasswordStrengthMeter({ password, className }: PasswordStrengthMeterProps) {
  const strength = getPasswordStrength(password);
  const labels = ["", "Fraca", "Moderada", "Forte"];
  const barColors = ["bg-muted", "bg-red-500", "bg-amber-400", "bg-emerald-500"];

  if (!password) return null;

  return (
    <div className={className ?? "space-y-1"}>
      <div className="flex gap-1">
        {[1, 2, 3].map((level) => (
          <div
            key={level}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
              strength >= level ? barColors[strength] : "bg-muted"
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Força da senha: <span className="font-medium">{labels[strength]}</span>
      </p>
    </div>
  );
}
