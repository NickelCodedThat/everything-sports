import type { PersonRef } from "@/types/entities";
import { TEAMS } from "./teams";

/** Fictional athletes for fixture/demo content, matching the invented teams in ./teams. */
export const PEOPLE = {
  MARCUS_DEVEREAUX: { id: "marcus-devereaux", name: "Marcus Devereaux", sport: "basketball", teamId: TEAMS.PORTLAND_IRONLINE.id },
  ELIAS_KOVAC: { id: "elias-kovac", name: "Elias Kovac", sport: "basketball", teamId: TEAMS.CHICAGO_VANTAGE.id },
  JAYDEN_OSEI: { id: "jayden-osei", name: "Jayden Osei", sport: "basketball", teamId: TEAMS.BROOKLYN_COMBINE.id },
  TRE_ANDERSON: { id: "tre-anderson", name: "Tre Anderson", sport: "basketball", teamId: TEAMS.DENVER_ALTITUDE.id },
  NAOMI_PRICE: { id: "naomi-price", name: "Naomi Price", sport: "basketball", teamId: TEAMS.SEATTLE_CURRENT.id },
  DESTINY_HALE: { id: "destiny-hale", name: "Destiny Hale", sport: "basketball", teamId: TEAMS.ATLANTA_LIFT.id },
  COACH_RENNER: { id: "coach-renner", name: "Bill Renner", sport: "basketball", teamId: TEAMS.PHOENIX_SOLACE.id },
  WES_CALLOWAY: { id: "wes-calloway", name: "Wes Calloway", sport: "football", teamId: TEAMS.KANSAS_CITY_OVERDRIVE.id },
  DARNELL_ROSS: { id: "darnell-ross", name: "Darnell Ross", sport: "football", teamId: TEAMS.CLEVELAND_FOUNDRY.id },
  JT_MABREY: { id: "jt-mabrey", name: "J.T. Mabrey", sport: "football", teamId: TEAMS.HOUSTON_MERIDIAN.id },
  COLE_ABERNATHY: { id: "cole-abernathy", name: "Cole Abernathy", sport: "football", teamId: TEAMS.DALLAS_FRONTIER.id },
  RAY_DOMINGUEZ: { id: "ray-dominguez", name: "Ray Dominguez", sport: "baseball", teamId: TEAMS.CINCINNATI_HARBOR.id },
  SOTO_ALVAREZ: { id: "soto-alvarez", name: "Soto Alvarez", sport: "baseball", teamId: TEAMS.SAN_DIEGO_TIDELINE.id },
  HANK_OYELARAN: { id: "hank-oyelaran", name: "Hank Oyelaran", sport: "baseball", teamId: TEAMS.MILWAUKEE_IRONWORKS.id },
  IZZY_MARCHETTI: { id: "izzy-marchetti", name: "Izzy Marchetti", sport: "boxing" },
  DESMOND_FAIRWEATHER: { id: "desmond-fairweather", name: "Desmond Fairweather", sport: "boxing" },
  RIKA_ASANO: { id: "rika-asano", name: "Rika Asano", sport: "mma" },
  TOMAS_VIEIRA: { id: "tomas-vieira", name: "Tomas Vieira", sport: "soccer", teamId: TEAMS.RIVERSIDE_UNITED.id },
  LUCA_FERRANTE: { id: "luca-ferrante", name: "Luca Ferrante", sport: "soccer", teamId: TEAMS.ATLANTIC_CITY_FC.id },
  KIRILL_PETROV: { id: "kirill-petrov", name: "Kirill Petrov", sport: "hockey", teamId: TEAMS.MINNESOTA_NORTHLINE.id },
  ANNIKA_SORENSTEN: { id: "annika-sorensten", name: "Annika Sorensten", sport: "golf" },
  PRIYA_CHANDRASEKAR: { id: "priya-chandrasekar", name: "Priya Chandrasekar", sport: "tennis" },
  MATEO_LINDQVIST: { id: "mateo-lindqvist", name: "Mateo Lindqvist", sport: "motorsports" },
} as const satisfies Record<string, PersonRef>;
