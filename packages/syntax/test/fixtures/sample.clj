(ns app.cart
  (:require [app.store :as store]
            [clojure.string :refer [join]])
  (:import (java.util Date)))
(defprotocol Shape (area [this]))
(defrecord Circle [r] Shape (area [this] (* 3.14 r r)))
(defn total "doc" [items & more] (store/save items) (helper items) (join "," more))
(defn- priv ([x] x) ([x y] (+ x y)))
(defmacro m [x] x)
(def answer 42)
(defmulti speak :type)
(defmethod speak :dog [x] "woof")
