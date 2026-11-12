module Shop.Cart (Cart(..), add) where

import qualified Data.Map as M
import Shop.Store (save)

data Cart = Cart { items :: [String] }

class Saver a where
  saveIt :: a -> String -> IO ()

add :: Cart -> String -> Int -> IO Int
add cart sku qty = do
  check sku
  save sku
  return (helper qty)

helper :: Int -> Int
helper n = n * 2

check :: String -> IO ()
check _ = pure ()
