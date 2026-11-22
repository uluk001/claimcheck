export interface SampleClaim {
  summary: string;
  product: string;
  /** Description lines in the format the claim parser reads. */
  lines: string[];
  /** What the demo expects the check to say, used in tests and docs. */
  expected: 'clear' | 'review' | 'risk';
}

export const SAMPLE_CLAIMS: SampleClaim[] = [
  {
    summary: 'Rear-ended at a traffic light, Toyota Camry',
    product: 'Motor (KASKO)',
    expected: 'clear',
    lines: [
      'Policy number: NP-KASKO-2026-00417',
      'Product: Motor (KASKO)',
      'Insured: Aigerim Sadykova',
      'Policy period: 2026-03-01 to 2027-02-28',
      'Date of loss: 2026-11-09',
      'Date reported: 2026-11-10',
      'Claimed amount: 2,400 USD',
      'Incident: I was stopped at a red traffic light on Abay Avenue when another car hit the rear of my vehicle. The other driver admitted fault and the traffic police recorded the collision at the scene. The rear bumper and boot lid are damaged.',
      'Documents provided: claim form, driving licence copy, vehicle registration certificate, photos of the damage, police report, repair estimate from approved garage',
    ],
  },
  {
    summary: 'Hit a lamp post after a birthday dinner, Hyundai Tucson',
    product: 'Motor (KASKO)',
    expected: 'risk',
    lines: [
      'Policy number: NP-KASKO-2026-00862',
      'Product: Motor (KASKO)',
      'Insured: Daniyar Ospanov',
      'Policy period: 2026-01-15 to 2027-01-14',
      'Date of loss: 2026-10-31',
      'Date reported: 2026-11-12',
      'Claimed amount: 6,800 USD',
      "Incident: Driving home from a friend's birthday dinner, where I had two glasses of wine, I lost control on a wet road and hit a lamp post. The front bumper, bonnet and radiator are damaged.",
      'Documents provided: claim form, photos of the damage, driving licence copy',
    ],
  },
  {
    summary: 'Side collision during an evening ride-hailing shift',
    product: 'Motor (KASKO)',
    expected: 'risk',
    lines: [
      'Policy number: NP-KASKO-2026-01133',
      'Product: Motor (KASKO)',
      'Insured: Ruslan Akhmetov',
      'Policy period: 2026-06-01 to 2027-05-31',
      'Date of loss: 2026-11-14',
      'Date reported: 2026-11-15',
      'Claimed amount: 3,900 USD',
      'Incident: I was working an evening shift for a ride-hailing app with a passenger on board when a van pulled out of a side street and hit the passenger door.',
      'Documents provided: claim form, photos of the damage',
    ],
  },
  {
    summary: 'Water damage in the kitchen from a washing machine hose',
    product: 'Home (property)',
    expected: 'review',
    lines: [
      'Policy number: NP-HOME-2026-00291',
      'Product: Home (property)',
      'Insured: Madina Abenova',
      'Policy period: 2026-09-20 to 2027-09-19',
      'Date of loss: 2026-11-03',
      'Date reported: 2026-11-06',
      'Claimed amount: 6,200 USD',
      'Incident: The washing machine hose had a slow leak for weeks behind the unit. We found swollen kitchen cabinets, damaged laminate flooring and mould on the wall when we moved the machine.',
      'Documents provided: claim form, photos of the damage, plumber report',
    ],
  },
  {
    summary: 'Phone stolen on the beach in Antalya',
    product: 'Travel',
    expected: 'review',
    lines: [
      'Policy number: NP-TRAVEL-2026-04410',
      'Product: Travel',
      'Insured: Timur Bekov',
      'Policy period: 2026-10-20 to 2026-11-03',
      'Date of loss: 2026-10-27',
      'Date reported: 2026-11-08',
      'Claimed amount: 950 USD',
      'Incident: I left my bag with my phone on a sunbed at the public beach while swimming. When I came back after twenty minutes the phone had been stolen.',
      'Documents provided: claim form, passport and tickets, phone purchase receipt',
    ],
  },
];
