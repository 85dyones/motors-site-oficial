/**
 * Finance Calculator Engine
 * Calculates simulated vehicle financing parcels based on realistic coefficient matrices.
 */

export interface SimulationParams {
  vehiclePrice: number;
  vehicleYear: number;
  downPaymentPercent: number; // 0 to 100
  installments: number; // e.g., 24, 36, 48, 60
}

export interface SimulationResult {
  amountFinanced: number;
  downPaymentValue: number;
  monthlyInstallment: number;
  interestRateApplied: number; // percentage (e.g., 1.45)
  totalPayable: number;
}

export function calculateFinancing(params: SimulationParams): SimulationResult {
  const currentYear = new Date().getFullYear();
  const vehicleAge = Math.max(0, currentYear - params.vehicleYear);

  // 1. Base Rate Definition (e.g., 1.39% per month)
  let baseRate = 1.39;

  // 2. Age Multiplier
  if (vehicleAge <= 3) {
    baseRate *= 1.0;
  } else if (vehicleAge <= 7) {
    baseRate *= 1.15; // +15% on the rate
  } else {
    baseRate *= 1.35; // +35% on the rate
  }

  // 3. Down Payment Penalty/Discount (Flat addition to the rate)
  if (params.downPaymentPercent < 20) {
    baseRate += 0.3; // High risk
  } else if (params.downPaymentPercent < 30) {
    baseRate += 0.1;
  } else if (params.downPaymentPercent >= 50) {
    baseRate -= 0.1; // Low risk discount
  }

  // Minimum floor rate to avoid unrealistically low rates
  const finalMonthlyRatePercent = Math.max(0.99, baseRate);
  const i = finalMonthlyRatePercent / 100; // Decimal representation

  const downPaymentValue = params.vehiclePrice * (params.downPaymentPercent / 100);
  const amountFinanced = params.vehiclePrice - downPaymentValue;

  // Price Amortization Formula: PMT = (PV * i) / (1 - (1 + i)^-n)
  let monthlyInstallment = 0;
  if (amountFinanced > 0 && params.installments > 0) {
    monthlyInstallment =
      (amountFinanced * i) / (1 - Math.pow(1 + i, -params.installments));
  }

  const totalPayable = downPaymentValue + (monthlyInstallment * params.installments);

  return {
    amountFinanced,
    downPaymentValue,
    monthlyInstallment,
    interestRateApplied: Number(finalMonthlyRatePercent.toFixed(2)),
    totalPayable,
  };
}
