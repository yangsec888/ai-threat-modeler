/**
 * Utility Functions for AI Threat Modeler Dashboard
 * 
 * Author: Sam Li
 */

import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

