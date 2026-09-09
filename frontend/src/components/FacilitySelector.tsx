import React from 'react';
import { Building2, Flame, AlertCircle } from 'lucide-react';

export interface CorporateFacility {
  key: string;
  name: string;
  company: string;
  sector: string;
  state: string;
  coords: [number, number];
  isDisaster?: boolean;
}

export const CORPORATE_FACILITIES: CorporateFacility[] = [
  {
    key: 'jamnagar_refinery',
    name: 'Reliance Jamnagar Complex',
    company: 'Reliance Industries Limited',
    sector: 'Petroleum & Petrochemicals',
    state: 'Gujarat',
    coords: [22.4707, 69.8331],
  },
  {
    key: 'iocl_paradip',
    name: 'IOCL Paradip Refinery',
    company: 'Indian Oil Corporation',
    sector: 'Coastal Petroleum Refining',
    state: 'Odisha',
    coords: [20.2829, 86.6190],
  },
  {
    key: 'ongc_mumbai_high',
    name: 'ONGC Mumbai High',
    company: 'Oil & Natural Gas Corp (ONGC)',
    sector: 'Offshore Marine Extraction',
    state: 'Arabian Sea',
    coords: [19.4167, 71.3333],
  },
  {
    key: 'bhilai_steel_plant',
    name: 'SAIL Bhilai Steel Plant',
    company: 'Steel Authority of India (SAIL)',
    sector: 'Iron & Blast Furnaces',
    state: 'Chhattisgarh',
    coords: [21.1895, 81.3976],
  },
  {
    key: 'tata_jamshedpur',
    name: 'Tata Steel Jamshedpur',
    company: 'Tata Steel Limited',
    sector: 'Heavy Metallurgy',
    state: 'Jharkhand',
    coords: [22.7844, 86.1950],
  },
  {
    key: 'gail_pata',
    name: 'GAIL Pata Complex',
    company: 'GAIL (India) Limited',
    sector: 'Gas Cracking & Polymers',
    state: 'Uttar Pradesh',
    coords: [26.5989, 79.5292],
  },
  {
    key: 'ntpc_singrauli',
    name: 'NTPC Singrauli',
    company: 'NTPC Limited',
    sector: 'Super Thermal Power',
    state: 'Madhya Pradesh',
    coords: [24.1011, 82.6844],
  },
  {
    key: 'disaster_baghjan',
    name: 'Baghjan 5 Well Blowout',
    company: 'Oil India Limited (Disaster)',
    sector: 'Historical Disaster Ground-Truth',
    state: 'Assam',
    coords: [27.5925, 95.3417],
    isDisaster: true,
  },
  {
    key: 'punjab_stubble_sample',
    name: 'Punjab Crop Stubble',
    company: 'Agricultural Lands',
    sector: 'Seasonal Stubble Burning',
    state: 'Punjab',
    coords: [30.2458, 75.8421],
  },
];

interface FacilitySelectorProps {
  selectedKey: string;
  onSelect: (facility: CorporateFacility) => void;
  disabled?: boolean;
}

export const FacilitySelector: React.FC<FacilitySelectorProps> = ({
  selectedKey,
  onSelect,
  disabled,
}) => {
  return (
    <div className="flex items-center space-x-2 overflow-x-auto py-1 px-1 scrollbar-thin">
      <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400 shrink-0 flex items-center gap-1">
        <Building2 className="w-3.5 h-3.5 text-blue-400" />
        <span>Corporate Target:</span>
      </span>
      <div className="flex space-x-1.5 shrink-0">
        {CORPORATE_FACILITIES.map((fac) => {
          const isSelected = fac.key === selectedKey;
          return (
            <button
              key={fac.key}
              disabled={disabled}
              onClick={() => onSelect(fac)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-mono whitespace-nowrap transition flex items-center space-x-1.5 active:scale-95 ${
                isSelected
                  ? fac.isDisaster
                    ? 'bg-red-950 text-red-300 font-bold border border-red-700 shadow-md shadow-red-950/40'
                    : 'bg-blue-950 text-blue-300 font-bold border border-blue-700 shadow-md shadow-blue-950/40'
                  : 'bg-zinc-900/90 text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:border-zinc-700'
              }`}
            >
              {fac.isDisaster ? (
                <AlertCircle className="w-3 h-3 text-red-400" />
              ) : (
                <Flame className={`w-3 h-3 ${isSelected ? 'text-amber-400' : 'text-zinc-500'}`} />
              )}
              <span>{fac.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
