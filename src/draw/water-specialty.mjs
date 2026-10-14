// SPDX-License-Identifier: AGPL-3.0-only
import {encodeHex} from './water-color.mjs';

const unit = value => Number.isFinite(value) && value >= 0 && value <= 1;
const freeze = value => {
 if (value && typeof value === 'object') { for (const item of Object.values(value)) freeze(item); Object.freeze(value); }
 return value;
};
const minerals = [
 ['lunar-black','Lunar Black','PBk11','#252728',1,.15,.82,[0,0,0],0,'granulating'],
 ['potters-pink',"Potter's Pink",'PR233','#ad7476',.9,.05,.68,[0,0,0],0,'granulating'],
 ['iridescent-moonstone','Iridescent Moonstone','PW20 + PW6','#c7c7c6',.65,0,.45,[.76,.82,.9],.35,'iridescent'],
 ['iridescent-sapphire','Iridescent Sapphire','PW20 + PW6','#797387',.55,0,.4,[.44,.36,.92],.9,'iridescent'],
 ['iridescent-gold','Iridescent Gold','PW20 + iron oxide','#b69644',.65,0,.55,[.95,.65,.19],0,'metallic'],
 ['iridescent-copper','Iridescent Copper','PW20 + iron oxide','#b16b49',.7,0,.6,[.93,.4,.19],0,'metallic']
];
export const WATER_SPECIALTY_PIGMENTS = freeze(minerals.map(([id,name,ci,colour,granulation,staining,settling,sheen,iridescence,family]) => ({
 id,name,ci,colour,granulation,staining,coefficients:Array.from(encodeHex(colour)),pro:true,family,finish:{settling,sheen,iridescence}
})));
export const waterSpecialtyById = id => WATER_SPECIALTY_PIGMENTS.find(row => row.id === id) || null;
export function admitWaterFinish(raw) {
 if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length !== 3 || !Object.keys(raw).every(key => ['settling','sheen','iridescence'].includes(key)) ||
  !unit(raw.settling) || !unit(raw.iridescence) || !Array.isArray(raw.sheen) || raw.sheen.length !== 3 || !raw.sheen.every(unit)) return null;
 return {settling:raw.settling,sheen:raw.sheen.slice(),iridescence:raw.iridescence};
}
export function waterPigmentFinish(value) {
 return admitWaterFinish((typeof value === 'string' ? waterSpecialtyById(value) : value)?.finish);
}
export const isWaterSpecialtyPigment = value => !!waterPigmentFinish(value);
export function waterFinishLight(x=0,y=0) {
 if (![x,y].every(Number.isFinite)) throw new RangeError('Invalid Water light direction');
 const direction=[-.38+Math.max(-1,Math.min(1,x))*.75,.45+Math.max(-1,Math.min(1,y))*.75,.82];
 const length=Math.hypot(...direction);return direction.map(value=>value/length);
}
export const WATER_FINISH_LIGHT = Object.freeze(waterFinishLight());
