import { defaultRecipe } from './data'
import type { Recipe } from './types'

export const SCENARIOS:{name:string;description:string;recipe:()=>Recipe}[]=[
  {name:'The lunar neck',description:'Earth–Moon · L₁ · four manifold branches',recipe:()=>defaultRecipe()},
  {name:'Beyond Jupiter',description:'Sun–Jupiter · L₂ · a second gateway',recipe:()=>({...defaultRecipe('sun-jupiter'),point:2})},
  {name:'A small change',description:'Earth–Moon · a 0.00001 radian ensemble fan',recipe:()=>({...defaultRecipe(),mode:'ensemble',spread:1e-5,count:32,horizon:12,projection:'position'})},
]
