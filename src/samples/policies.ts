export interface SamplePolicy {
  id: string;
  product: string;
  /** Words that identify this product in a claim's "Product" line. */
  aliases: string[];
  title: string;
  wording: string;
}

export const SAMPLE_POLICIES: SamplePolicy[] = [
  {
    id: 'motor',
    product: 'Motor (KASKO)',
    aliases: ['motor', 'kasko', 'casco', 'car', 'vehicle', 'auto'],
    title: 'NorthPeak Motor Insurance (KASKO): Policy Wording',
    wording: `# NorthPeak Motor Insurance (KASKO): Policy Wording

## 1. What we cover
1.1 We cover accidental damage to the insured vehicle caused by a collision, overturning or impact with another vehicle, object or animal.
1.2 We cover damage to the insured vehicle caused by fire, explosion, lightning, storm, hail or falling objects.
1.3 We cover theft of the insured vehicle and damage caused by attempted theft or vandalism by third parties.
1.4 We cover broken windscreen and window glass up to the glass limit in clause 2.3.

## 2. Limits and deductible
2.1 Sum insured: 25,000 USD per period of insurance, reduced by the amount of any claim we pay.
2.2 Deductible: 300 USD for each and every claim, except windscreen and glass claims.
2.3 Windscreen and glass limit: 800 USD per claim.

## 3. Making a claim
3.1 You must notify us of any accident, theft or damage within 7 days of the date of loss.
3.2 For theft or vandalism you must also report the incident to the police within 24 hours of discovering it.
3.3 You must not repair the vehicle before our surveyor has inspected the damage, unless we agree in writing.

## 4. Exclusions
4.1 We do not cover damage while the vehicle is driven by a person under the influence of alcohol, narcotics or other intoxicating substances.
4.2 We do not cover damage while the vehicle is driven by a person who does not hold a valid driving licence for the vehicle category.
4.3 We do not cover wear and tear, corrosion, mechanical or electrical breakdown, or damage to tyres caused by braking, punctures or road surfaces.
4.4 We do not cover damage while the vehicle is used for hire or reward, including taxi, ride-hailing or courier delivery services, unless this use is shown in the policy schedule.
4.5 We do not cover damage while the vehicle is used for racing, rallies, speed trials or track days.
4.6 We do not cover theft if the vehicle was left unlocked or with the keys inside it.
4.7 We do not cover damage caused deliberately by you or by any person driving with your permission.

## 5. Documents we need
5.1 For every claim we need the following documents:
- completed claim form
- copy of the driver's driving licence
- vehicle registration certificate
- photos of the damage
- police report (for theft, vandalism, third-party involvement or damage above 1,000 USD)
- repair estimate from an approved garage (if the damage is above 1,000 USD)
`,
  },
  {
    id: 'home',
    product: 'Home (property)',
    aliases: ['home', 'house', 'property', 'apartment', 'flat', 'household', 'dwelling'],
    title: 'NorthPeak Home Insurance: Policy Wording',
    wording: `# NorthPeak Home Insurance: Policy Wording

## 1. What we cover
1.1 We cover sudden and accidental damage to your home and contents caused by fire, smoke, explosion or lightning.
1.2 We cover damage caused by escape of water from fixed pipes, tanks, radiators or household appliances, including the cost of finding the leak.
1.3 We cover theft of contents following forcible and violent entry into your home.
1.4 We cover damage caused by storm, hail or the weight of snow.

## 2. Limits and deductible
2.1 Sum insured for the building: 60,000 USD per period of insurance.
2.2 Contents limit: 15,000 USD per claim.
2.3 Escape of water limit: 5,000 USD per claim, including the cost of finding the leak.
2.4 Deductible: 150 USD for each and every claim.

## 3. Waiting period
3.1 There is a waiting period of 14 days from the policy start date for storm, flood and escape of water claims.

## 4. Making a claim
4.1 You must tell us about any damage within 14 days of discovering it.
4.2 For theft or malicious damage you must report the incident to the police within 48 hours.

## 5. Exclusions
5.1 We do not cover damage caused by gradual leaks, seepage, damp, rot or mould, or by a lack of maintenance.
5.2 We do not cover loss or damage if your home has been unoccupied for more than 45 consecutive days.
5.3 We do not cover damage caused by earthquake, landslide or mudflow unless shown in your policy schedule.
5.4 We do not cover theft or damage caused by you, your family or anyone you have allowed to stay in your home.
5.5 We do not cover wear and tear or gradual deterioration.

## 6. Documents we need
6.1 For every claim we need the following documents:
- completed claim form
- photos of the damage
- receipts or other proof of ownership for damaged contents
- plumber's or repairer's report (for escape of water claims)
- police report (for theft or malicious damage)
`,
  },
  {
    id: 'travel',
    product: 'Travel',
    aliases: ['travel', 'trip', 'medical abroad', 'holiday'],
    title: 'NorthPeak Travel Insurance: Policy Wording',
    wording: `# NorthPeak Travel Insurance: Policy Wording

## 1. What we cover
1.1 We cover emergency medical treatment abroad for sudden illness or accidental injury during your trip.
1.2 We cover theft of or damage to your personal belongings and baggage during your trip.
1.3 We cover additional travel costs if your return journey is delayed by more than 12 hours.

## 2. Limits and deductible
2.1 Medical expenses limit: 30,000 USD per trip.
2.2 Personal belongings limit: 1,500 USD per trip, with a single item limit of 500 USD.
2.3 Travel delay limit: 300 USD per trip.
2.4 Deductible: 50 USD for each and every claim.

## 3. Making a claim
3.1 You must contact our 24-hour assistance line within 48 hours of any hospital admission.
3.2 You must notify us of any other claim within 30 days of your return home.
3.3 You must report theft of belongings to the local police within 24 hours and obtain a written report.

## 4. Exclusions
4.1 We do not cover medical treatment for any pre-existing medical condition that you knew about before the trip.
4.2 We do not cover belongings left unattended in a public place or in an unattended vehicle.
4.3 We do not cover injury while taking part in hazardous activities, including off-piste skiing, skydiving, bungee jumping or scuba diving below 30 metres.
4.4 We do not cover claims arising from alcohol or drug use.
4.5 We do not cover loss caused by war, riot or civil commotion.

## 5. Documents we need
5.1 For every claim we need the following documents:
- completed claim form
- copy of your passport and tickets
- medical report and invoices (for medical claims)
- police report (for theft)
- receipts or proof of ownership for lost or damaged items
`,
  },
];

export function samplePolicyFor(product: string | undefined): SamplePolicy | null {
  if (!product) return null;
  const p = product.toLowerCase();
  return SAMPLE_POLICIES.find((s) => s.aliases.some((a) => p.includes(a))) ?? null;
}
