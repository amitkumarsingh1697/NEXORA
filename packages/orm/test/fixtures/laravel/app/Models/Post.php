<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Post extends Model
{
    protected $fillable = ['title'];
}

class Category extends Model
{
    protected $table = 'topics';
}
