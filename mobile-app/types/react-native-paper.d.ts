import "react-native-paper";

declare module "react-native-paper/lib/typescript/types" {
  interface MD3Colors {
    surfaceContainerHigh: string;
    surfaceContainerHighest: string;
    surfaceContainer: string;
    surfaceContainerLow: string;
    surfaceContainerLowest: string;
    surfaceBright: string;
    surfaceDim: string;
  }
}

declare module "react-native-paper/src/types" {
  interface MD3Colors {
    surfaceContainerHigh: string;
    surfaceContainerHighest: string;
    surfaceContainer: string;
    surfaceContainerLow: string;
    surfaceContainerLowest: string;
    surfaceBright: string;
    surfaceDim: string;
  }
}
